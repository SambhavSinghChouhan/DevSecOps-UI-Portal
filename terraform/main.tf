# Get default VPC
data "aws_vpc" "default" {
  default = true
}

# Get default subnet
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Latest Ubuntu 22.04 AMI
data "aws_ami" "ubuntu" {
  most_recent = true

  owners = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Security Group
# USE EXISTING SECURITY GROUP
data "aws_security_group" "k8s_sg" {

  name   = "k8s-security-group"

  vpc_id = data.aws_vpc.default.id
}

# EC2 Instance
resource "aws_instance" "k8s_ec2" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "m7i-flex.large"
  key_name               = var.key_name
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [data.aws_security_group.k8s_sg.id]

  associate_public_ip_address = true

  root_block_device {
    volume_size = 25
    volume_type = "gp3"
  }

  tags = {
    Name = var.instance_name
  }
}